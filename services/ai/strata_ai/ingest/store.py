"""Save a processed material: document, pages, chapters, passages, and the knowledge it adds.

Everything is written in one transaction, so a learner never sees half a library. Processing the
same material again replaces what it contributed before. Topics merge into the learner's existing
topics in the same subject when they are clearly the same concept (same title, or near-identical
meaning), so a second book on a subject deepens topics instead of duplicating them.
"""

import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool

from strata_ai.ingest.analysis import DocumentAnalysis
from strata_ai.ingest.chunking import Chunk
from strata_ai.ingest.extract import Extracted
from strata_ai.ingest.structure import Structure

# Cosine distance under which two topics in one subject are treated as the same concept.
SAME_TOPIC_DISTANCE = 0.05
LANGUAGE_TAG = re.compile(r"^([a-z]{2,3})(?:[-_]([a-z]{2}))?$", re.IGNORECASE)


@dataclass
class Processed:
    extracted: Extracted
    chunks: list[Chunk]
    chunk_vectors: list[list[float]]
    structure: Structure
    analysis: DocumentAnalysis
    topic_vectors: list[list[float]]
    checksum: str
    pages_counted: int
    warnings: list[dict[str, Any]] = field(default_factory=list)


def vector(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.7g}" for v in values) + "]"


def language_tag(value: str | None) -> str | None:
    """A tag the database accepts (en, pt-BR), or None."""
    match = LANGUAGE_TAG.match((value or "").strip())
    if not match:
        return None
    base, region = match.group(1).lower(), match.group(2)
    return f"{base}-{region.upper()}" if region else base


async def save(
    pool: AsyncConnectionPool, material_id: uuid.UUID, user_id: uuid.UUID, p: Processed
) -> dict | None:
    """Store everything and mark the material ready. Returns None if the material was deleted."""
    async with pool.connection() as conn, conn.transaction():
        cur = await conn.execute(
            "select id, title from public.materials where id = %s and user_id = %s for update",
            (material_id, user_id),
        )
        material = await cur.fetchone()
        if material is None:
            return None
        language = language_tag(p.analysis.language)

        # Replace what an earlier run of this material contributed. Topics left without any
        # source are pruned by a trigger.
        await conn.execute("delete from public.knowledge_items where material_id = %s", (material_id,))
        await conn.execute("delete from public.documents where material_id = %s", (material_id,))

        document_id = uuid.uuid4()
        await conn.execute(
            """insert into public.documents (id, user_id, material_id, parser, parser_version, page_count,
                                             language, outline)
               values (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                document_id,
                user_id,
                material_id,
                p.extracted.parser,
                p.extracted.parser_version[:200],
                p.extracted.page_count,
                language,
                json.dumps(
                    [{"title": e.title, "level": e.level, "page": e.page} for e in p.extracted.outline]
                ),
            ),
        )
        if p.extracted.page_count:
            async with conn.cursor() as cur:
                await cur.executemany(
                    """insert into public.document_pages (user_id, document_id, page_number, has_text_layer)
                       values (%s, %s, %s, %s)""",
                    [
                        (user_id, document_id, number, number in p.extracted.pages_with_text)
                        for number in range(1, p.extracted.page_count + 1)
                    ],
                )

        chapter_ids = [uuid.uuid4() for _ in p.structure.chapters]
        async with conn.cursor() as cur:
            await cur.executemany(
                """insert into public.chapters (id, user_id, document_id, parent_id, title, level, ordinal,
                                                page_start, page_end)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [
                    (
                        chapter_ids[index],
                        user_id,
                        document_id,
                        chapter_ids[chapter.parent] if chapter.parent is not None else None,
                        chapter.title,
                        chapter.level,
                        index,
                        chapter.page_start,
                        chapter.page_end,
                    )
                    for index, chapter in enumerate(p.structure.chapters)
                ],
            )

        chunk_ids = [uuid.uuid4() for _ in p.chunks]
        async with conn.cursor() as cur:
            await cur.executemany(
                """insert into public.document_chunks (id, user_id, document_id, chapter_id, ordinal, content,
                                                       token_count, page_start, page_end, heading_path,
                                                       source_kind, language, embedding)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::extensions.vector)""",
                [
                    (
                        chunk_ids[index],
                        user_id,
                        document_id,
                        chapter_ids[p.structure.chunk_chapter[index]],
                        chunk.ordinal,
                        chunk.text,
                        chunk.token_count,
                        chunk.page_start,
                        chunk.page_end,
                        list(chunk.heading_path),
                        chunk.source_kind,
                        language,
                        vector(p.chunk_vectors[index]),
                    )
                    for index, chunk in enumerate(p.chunks)
                ],
            )

        subject_id = await _subject(conn, user_id, p.analysis.subject, p.analysis.subject_description)
        stats = await _knowledge(conn, user_id, material_id, subject_id, language, p, chapter_ids, chunk_ids)

        await conn.execute(
            """update public.materials
                  set status = 'ready', stage = 'ready', progress = 1, error = null,
                      language = %s, page_count = %s, checksum_sha256 = %s
                where id = %s""",
            (language, p.extracted.page_count, p.checksum, material_id),
        )
        await conn.execute(
            """insert into public.usage_counters (user_id, metric, period_start, used)
               values (%s, 'pages', date_trunc('month', now())::date, %s)
               on conflict (user_id, metric, period_start)
               do update set used = public.usage_counters.used + excluded.used, updated_at = now()""",
            (user_id, p.pages_counted),
        )
        stats.update(chapters=len(chapter_ids), passages=len(chunk_ids), pages=p.extracted.page_count)
        await conn.execute(
            """insert into public.notifications (user_id, kind, title, data)
               values (%s, 'material_ready', %s, %s)""",
            (
                user_id,
                material["title"][:200],
                json.dumps(
                    {"material_id": str(material_id), "topics": stats["topics"], "warnings": p.warnings}
                ),
            ),
        )
        return stats


async def _subject(conn: AsyncConnection, user_id: uuid.UUID, name: str, description: str) -> uuid.UUID:
    name = name.strip()[:120] or "General"
    cur = await conn.execute(
        "select id from public.subjects where user_id = %s and lower(name) = lower(%s) limit 1",
        (user_id, name),
    )
    row = await cur.fetchone()
    if row is not None:
        return row["id"]
    cur = await conn.execute(
        """insert into public.subjects (user_id, name, description) values (%s, %s, %s)
           on conflict (user_id, name) do update set updated_at = now()
           returning id""",
        (user_id, name, description[:1000] or None),
    )
    return (await cur.fetchone())["id"]


async def _knowledge(
    conn: AsyncConnection,
    user_id: uuid.UUID,
    material_id: uuid.UUID,
    subject_id: uuid.UUID,
    language: str | None,
    p: Processed,
    chapter_ids: list[uuid.UUID],
    chunk_ids: list[uuid.UUID],
) -> dict[str, int]:
    cur = await conn.execute("select slug from public.topics where user_id = %s", (user_id,))
    taken = {row["slug"] for row in await cur.fetchall()}

    topic_ids: dict[str, uuid.UUID] = {}
    created: set[uuid.UUID] = set()
    merged = 0
    for topic, embedding in zip(p.analysis.topics, p.topic_vectors, strict=True):
        literal = vector(embedding)
        cur = await conn.execute(
            """select id from public.topics
                where user_id = %(user)s and subject_id = %(subject)s
                  and (lower(title) = lower(%(title)s)
                       or embedding operator(extensions.<=>) %(vec)s::extensions.vector < %(distance)s)
                order by lower(title) = lower(%(title)s) desc,
                         embedding operator(extensions.<=>) %(vec)s::extensions.vector
                limit 1""",
            {
                "user": user_id,
                "subject": subject_id,
                "title": topic.title,
                "vec": literal,
                "distance": SAME_TOPIC_DISTANCE,
            },
        )
        row = await cur.fetchone()
        if row is not None:
            topic_ids[topic.key] = row["id"]
            merged += row["id"] not in created
            await conn.execute(
                "update public.topics set importance = greatest(importance, %s) where id = %s",
                (topic.importance, row["id"]),
            )
            continue
        slug = _free_slug(topic.key, taken)
        cur = await conn.execute(
            """insert into public.topics (user_id, subject_id, title, slug, summary, difficulty, importance,
                                          language, embedding)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s::extensions.vector)
               returning id""",
            (
                user_id,
                subject_id,
                topic.title,
                slug,
                topic.summary or None,
                topic.difficulty,
                topic.importance,
                language,
                literal,
            ),
        )
        topic_id = (await cur.fetchone())["id"]
        topic_ids[topic.key] = topic_id
        created.add(topic_id)

    for topic in p.analysis.topics:
        topic_id = topic_ids[topic.key]
        parent_id = topic_ids.get(topic.parent or "")
        if topic_id in created and parent_id is not None and parent_id != topic_id:
            await conn.execute(
                "update public.topics set parent_topic_id = %s where id = %s and parent_topic_id is null",
                (parent_id, topic_id),
            )

    sources = {
        (topic_ids[topic.key], chapter_ids[p.structure.chunk_chapter[chunk]])
        for topic in p.analysis.topics
        for chunk in (topic.chunks or {0})
        if 0 <= chunk < len(chunk_ids)
    }
    async with conn.cursor() as cur:
        await cur.executemany(
            """insert into public.topic_sources (topic_id, chapter_id, user_id, material_id)
               values (%s, %s, %s, %s) on conflict do nothing""",
            [
                (topic_id, chapter_id, user_id, material_id)
                for topic_id, chapter_id in sorted(sources, key=str)
            ],
        )

    relations = {
        (topic_ids[r.source], topic_ids[r.target], r.kind): r.basis
        for r in p.analysis.relations
        if r.source in topic_ids and r.target in topic_ids and topic_ids[r.source] != topic_ids[r.target]
    }
    async with conn.cursor() as cur:
        await cur.executemany(
            """insert into public.topic_relations (user_id, from_topic_id, to_topic_id, relation, basis)
               values (%s, %s, %s, %s, %s) on conflict (from_topic_id, to_topic_id, relation) do nothing""",
            [(user_id, source, target, kind, basis) for (source, target, kind), basis in relations.items()],
        )

    items: list[tuple] = []
    citations: list[tuple] = []
    next_ordinal: dict[uuid.UUID, int] = {}
    for topic in p.analysis.topics:
        topic_id = topic_ids[topic.key]
        if topic_id not in next_ordinal:
            cur = await conn.execute(
                "select coalesce(max(ordinal) + 1, 0) as next"
                " from public.knowledge_items where topic_id = %s",
                (topic_id,),
            )
            next_ordinal[topic_id] = (await cur.fetchone())["next"]
        for item in topic.items:
            item_id = uuid.uuid4()
            items.append(
                (
                    item_id,
                    user_id,
                    topic_id,
                    material_id,
                    item.kind,
                    item.term,
                    item.content,
                    item.basis,
                    next_ordinal[topic_id],
                )
            )
            next_ordinal[topic_id] += 1
            for citation in item.citations:
                chunk = p.chunks[citation.chunk]
                citations.append(
                    (
                        user_id,
                        chunk_ids[citation.chunk],
                        item_id,
                        chunk.page_at(citation.offset),
                        citation.quote,
                    )
                )
    async with conn.cursor() as cur:
        await cur.executemany(
            """insert into public.knowledge_items
                 (id, user_id, topic_id, material_id, kind, term, content, basis, ordinal)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            items,
        )
        await cur.executemany(
            """insert into public.citations (user_id, chunk_id, subject_type, subject_id, page_number, quote,
                                             verified)
               values (%s, %s, 'knowledge_item', %s, %s, %s, true)""",
            citations,
        )
    return {
        "topics": len(set(topic_ids.values())),
        "topics_new": len(created),
        "topics_merged": merged,
        "items": len(items),
        "items_from_source": sum(1 for item in items if item[7] == "source"),
        "citations": len(citations),
        "relations": len(relations),
    }


def _free_slug(base: str, taken: set[str]) -> str:
    base = base[:72].strip("-") or "topic"
    candidate, n = base, 2
    while candidate in taken:
        candidate = f"{base}-{n}"
        n += 1
    taken.add(candidate)
    return candidate
