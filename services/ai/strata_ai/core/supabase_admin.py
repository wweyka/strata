"""Thin client for the Supabase Auth admin and Storage APIs, used with the service role key."""

from urllib.parse import quote

import httpx

USER_BUCKETS = ("materials", "generated", "avatars")


class SupabaseAdminError(Exception):
    pass


class SupabaseAdmin:
    def __init__(self, url: str, service_role_key: str, transport: httpx.AsyncBaseTransport | None = None):
        headers = {"apikey": service_role_key}
        # Legacy service_role keys are JWTs and go in Authorization too. New secret keys
        # (sb_secret_...) are sent as apikey only; the Supabase gateway swaps them for a JWT.
        if service_role_key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {service_role_key}"
        self._client = httpx.AsyncClient(
            base_url=url,
            headers=headers,
            timeout=30.0,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def list_files(self, bucket: str, prefix: str) -> list[str]:
        """All object paths under a folder, recursively."""
        paths: list[str] = []
        offset = 0
        while True:
            response = await self._client.post(
                f"/storage/v1/object/list/{bucket}",
                json={"prefix": prefix, "limit": 1000, "offset": offset},
            )
            if response.status_code == 400 and "not found" in response.text.lower():
                return paths
            if response.is_error:
                raise SupabaseAdminError(f"listing {bucket}/{prefix} failed: {response.status_code}")
            items = response.json()
            for item in items:
                path = f"{prefix}/{item['name']}"
                if item.get("id") is None:  # a folder
                    paths.extend(await self.list_files(bucket, path))
                else:
                    paths.append(path)
            if len(items) < 1000:
                return paths
            offset += 1000

    async def download(self, bucket: str, path: str, max_bytes: int) -> bytes:
        """The object's bytes, refusing anything larger than `max_bytes`."""
        url = f"/storage/v1/object/{bucket}/{quote(path)}"
        async with self._client.stream("GET", url, timeout=300.0) as response:
            if response.status_code in (400, 404):
                raise SupabaseAdminError(f"{bucket}/{path} was not found in storage")
            if response.is_error:
                raise SupabaseAdminError(f"downloading from {bucket} failed: {response.status_code}")
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    raise SupabaseAdminError(f"{bucket}/{path} is larger than {max_bytes} bytes")
                chunks.append(chunk)
        return b"".join(chunks)

    async def remove_files(self, bucket: str, paths: list[str]) -> None:
        for start in range(0, len(paths), 500):
            response = await self._client.request(
                "DELETE", f"/storage/v1/object/{bucket}", json={"prefixes": paths[start : start + 500]}
            )
            if response.is_error:
                raise SupabaseAdminError(f"removing files from {bucket} failed: {response.status_code}")

    async def delete_user(self, user_id: str) -> None:
        response = await self._client.delete(f"/auth/v1/admin/users/{user_id}")
        if response.is_error and response.status_code != 404:
            raise SupabaseAdminError(f"deleting user failed: {response.status_code}")

    async def delete_user_and_files(self, user_id: str) -> int:
        """Remove every file the user owns, then the user (database rows cascade).

        Files go first: if that fails the account is left intact rather than orphaning
        copyrighted uploads in storage.
        """
        removed = 0
        for bucket in USER_BUCKETS:
            paths = await self.list_files(bucket, user_id)
            if paths:
                await self.remove_files(bucket, paths)
                removed += len(paths)
        await self.delete_user(user_id)
        return removed
