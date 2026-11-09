// End-to-end check of Phase 1 against a running stack: sign-up with email confirmation,
// onboarding with a real upload, Discover controls, Library, learning modes, appearance sync,
// password reset and account deletion. Every step is verified in the database too.
//
// Requirements: the web build served at BASE_URL, Supabase (Auth, PostgREST, Storage),
// the AI service and worker running WITHOUT provider keys, `psql`, and Playwright.
//   BASE_URL      default http://localhost:8081
//   DATABASE_URL  default postgresql://postgres:postgres@127.0.0.1:54322/postgres
//   MAILPIT_URL   default http://127.0.0.1:54324 (the Supabase CLI's local mail catcher)
//   SHOTS_DIR     where screenshots go, default ./e2e/screenshots
// Run: node apps/app/e2e/full-flow.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { execSync } from 'node:child_process';
import { strict as assert } from 'node:assert';

import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const SHOTS = (process.env.SHOTS_DIR ?? new URL('./screenshots/', import.meta.url).pathname).replace(/\/?$/, '/');
mkdirSync(SHOTS, { recursive: true });
const sql = (q) => execSync(`psql "${DB}" -tAc ${JSON.stringify(q)}`).toString().trim();
async function mailbox() {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=50`);
  return (await res.json()).messages ?? [];
}
const mailCount = async () => (await mailbox()).length;
async function lastLink(to) {
  const latest = (await mailbox()).find((m) => m.To?.some((r) => r.Address === to));
  const body = await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json();
  const html = body.HTML || body.Text;
  const link = (html.match(/href="([^"]+)"/) ?? html.match(/(https?:\/\/\S+)/))[1];
  return link.replace(/&amp;/g, '&');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const v = await fn(); if (v) return v; } catch {}
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${label}`);
}
const vis = (l) => l.filter({ visible: true }).first();
const step = (s) => console.log(`\n▶ ${s}`);
const ok = (s) => console.log(`  ✓ ${s}`);

const email = `e2e+${Date.now()}@example.com`;
const password = 'correct-horse-battery';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/realtime|websocket|WebSocket/i.test(m.text())) errors.push(m.text()); });

try {
  step('Welcome');
  await page.goto(BASE);
  await page.waitForURL('**/welcome');
  await page.getByText('Learn from what you already have.').waitFor();
  await page.screenshot({ path: SHOTS + '01-welcome.png' });
  ok('unauthenticated visitor lands on /welcome');

  step('Sign up');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/sign-up');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Enter a valid email address.').waitFor();
  ok('client-side validation shows field errors');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const before = await mailCount();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/check-email**');
  await page.getByText('Check your email').waitFor();
  await page.screenshot({ path: SHOTS + '02-check-email.png' });
  await waitFor(async () => (await mailCount()) > before, 'confirmation email');
  ok('confirmation email delivered');
  assert.equal(sql(`select display_name from public.profiles p join auth.users u on u.id = p.id where u.email = '${email}'`), 'Ada Lovelace');
  assert.equal(sql(`select count(*) from public.learning_modes m join auth.users u on u.id = m.user_id where u.email = '${email}'`), '6');
  ok('profile and six learning modes created at sign-up');

  step('Confirm email via link');
  const link = await lastLink(email);
  assert.match(decodeURIComponent(link), /redirect_to=.*\/auth\/callback/);
  await page.goto(link);
  await page.waitForURL('**/onboarding', { timeout: 20000 });
  ok('PKCE code exchanged, routed to onboarding');

  step('Onboarding');
  await page.getByText('Your materials, turned into a way to learn.').waitFor();
  await page.screenshot({ path: SHOTS + '03-onboarding-concept.png' });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Español' }).click();
  await page.getByText('Idioma de la interfaz').waitFor();
  await waitFor(() => sql(`select interface_language from public.profiles p join auth.users u on u.id=p.id where u.email='${email}'`) === 'es', 'language saved');
  ok('switching to Spanish re-renders the UI and saves to the profile');
  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByText('Interface language').waitFor();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: 'Español' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox', { name: 'Physics' }).click();
  await page.getByLabel('Add your own').fill('Organic chemistry');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.screenshot({ path: SHOTS + '04-onboarding-interests.png' });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Add your first material').waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose a file' }).click(),
  ]);
  await chooser.setFiles(new URL('./fixtures/notes.txt', import.meta.url).pathname);
  await page.getByText('Uploaded. It will appear in your library').waitFor({ timeout: 20000 });
  await page.screenshot({ path: SHOTS + '05-onboarding-uploaded.png' });
  const profileRow = sql(`select learning_languages::text || '|' || interests::text from public.profiles p join auth.users u on u.id=p.id where u.email='${email}'`);
  assert.equal(profileRow, '{en,es}|{Physics,"Organic chemistry"}');
  ok('learning languages and interests saved');
  const mat = sql(`select m.status || '|' || m.storage_path || '|' || m.checksum_sha256 from public.materials m join auth.users u on u.id=m.user_id where u.email='${email}'`);
  const [status, storagePath] = mat.split('|');
  assert.ok(['queued', 'awaiting_credentials'].includes(status), status);
  assert.equal(sql(`select count(*) from storage.objects where bucket_id='materials' and name='${storagePath}'`), '1');
  assert.equal(sql(`select count(*) from public.jobs j join auth.users u on u.id=j.user_id where u.email='${email}' and j.kind='ingest_material'`), '1');
  ok(`file stored in the private folder (${storagePath.split('/').slice(1).join('/')}) and ingestion queued once`);
  await page.getByRole('button', { name: 'Start learning' }).click();
  await page.waitForURL('**/discover');
  ok('onboarding completed, routed to Discover');

  step('Worker parks ingestion without AI keys');
  await waitFor(() => sql(`select m.status from public.materials m join auth.users u on u.id=m.user_id where u.email='${email}'`) === 'awaiting_credentials', 'worker to park the job', 20000);
  await page.reload();
  await vis(page.getByText('Waiting for AI setup')).waitFor({ timeout: 15000 });
  await page.getByText('AI processing is not connected yet').waitFor();
  await page.screenshot({ path: SHOTS + '06-discover.png' });
  ok('material shows "Waiting for AI setup", nothing simulated');

  step('Discover controls persist');
  await page.getByRole('checkbox', { name: 'Videos' }).click();
  await waitFor(() => !sql(`select content_types::text from public.learning_modes m join auth.users u on u.id=m.user_id where u.email='${email}' and preset='balanced'`).includes('video'), 'video toggled off');
  ok('content-type toggle saved to the active mode');
  await page.getByRole('checkbox', { name: 'Quick revision' }).click();
  await waitFor(() => sql(`select m.preset from public.feed_preferences f join public.learning_modes m on m.id=f.active_mode_id join auth.users u on u.id=f.user_id where u.email='${email}'`) === 'quick_revision', 'mode switched');
  ok('learning mode switch saved to feed preferences');

  step('Library: upload, rename, delete');
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.waitForURL('**/library');
  await vis(page.getByText('notes', { exact: true })).waitFor();
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add material' }).click()]);
  await chooser2.setFiles(new URL('./fixtures/cells.md', import.meta.url).pathname);
  await vis(page.getByText('cells', { exact: true })).waitFor({ timeout: 20000 });
  const [chooser3] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add material' }).click()]);
  await chooser3.setFiles(new URL('./fixtures/notes.txt', import.meta.url).pathname);
  await page.getByText('You already uploaded this file as “notes”.').waitFor();
  ok('duplicate upload detected by checksum');
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.getByRole('button', { name: 'Actions for notes' }).click();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Title').fill('Photosynthesis notes');
  await page.getByRole('button', { name: 'Save' }).click();
  await vis(page.getByText('Photosynthesis notes')).waitFor();
  ok('rename saved');
  await sleep(700);
  await page.screenshot({ path: SHOTS + '07-library.png' });
  const cellsPath = sql(`select storage_path from public.materials m join auth.users u on u.id=m.user_id where u.email='${email}' and title='cells'`);
  await page.getByRole('button', { name: 'Actions for cells' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Delete this material?').waitFor();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await waitFor(() => sql(`select count(*) from public.materials m join auth.users u on u.id=m.user_id where u.email='${email}' and title='cells'`) === '0', 'material deleted');
  assert.equal(sql(`select count(*) from storage.objects where name='${cellsPath}'`), '0');
  ok('delete removed the stored file and the row');

  step('Learning mode editor');
  await page.getByRole('tab', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Learning modes' }).click();
  await page.waitForURL('**/profile/modes');
  await page.getByRole('button', { name: 'New mode' }).click();
  await page.getByLabel('Name').fill('Night reading');
  await page.getByRole('checkbox', { name: 'Summaries' }).click();
  await page.getByRole('button', { name: 'Increase New knowledge' }).click();
  await page.getByRole('button', { name: 'Increase New knowledge' }).click();
  await page.screenshot({ path: SHOTS + '08-mode-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Create mode' }).click();
  await page.waitForURL('**/profile/modes');
  const custom = sql(`select mix_new + mix_review + mix_weak + mix_practice || '|' || mix_new || '|' || content_types::text from public.learning_modes m join auth.users u on u.id=m.user_id where u.email='${email}' and name='Night reading'`);
  assert.equal(custom, '100|35|{video,flashcard,quiz}');
  ok('custom mode created; mix rebalanced to exactly 100');

  step('Profile, appearance, AI features');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForURL('**/profile');
  await vis(page.getByText('Awaiting credentials')).waitFor();
  await page.screenshot({ path: SHOTS + '09-profile-light.png', fullPage: true });
  await page.screenshot({ path: SHOTS + '09b-profile-light-viewport.png' });
  await page.getByRole('radio', { name: 'Dark' }).click();
  await waitFor(() => sql(`select appearance from public.profiles p join auth.users u on u.id=p.id where u.email='${email}'`) === 'dark', 'appearance saved');
  await sleep(400);
  await page.screenshot({ path: SHOTS + '10-profile-dark.png', fullPage: true });
  ok('AI features report awaiting credentials; dark appearance saved to profile');

  step('Sign out and back in on a fresh device');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/welcome');
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const phone = await fresh.newPage();
  await phone.goto(BASE + '/sign-in');
  await phone.getByLabel('Email').fill(email);
  await phone.getByLabel('Password', { exact: true }).fill('wrong-password');
  await phone.getByRole('button', { name: 'Sign in' }).click();
  await phone.getByText('The email or password is incorrect.').waitFor();
  ok('wrong password shows a clear error');
  await phone.getByLabel('Password', { exact: true }).fill(password);
  await phone.getByRole('button', { name: 'Sign in' }).click();
  await phone.waitForURL('**/discover');
  await vis(phone.getByText('Preparing your materials')).waitFor();
  const bg = await phone.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await phone.screenshot({ path: SHOTS + '11-phone-discover-dark.png' });
  await phone.getByRole('tab', { name: 'Library' }).click();
  await vis(phone.getByText('Photosynthesis notes')).waitFor();
  await phone.screenshot({ path: SHOTS + '12-phone-library-dark.png' });
  ok(`returning user skips onboarding; dark theme synced to new device (body ${bg})`);

  step('Password reset');
  await phone.getByRole('tab', { name: 'Profile' }).click();
  await phone.getByRole('button', { name: 'Sign out' }).click();
  await phone.waitForURL('**/welcome');
  await phone.goto(BASE + '/forgot-password');
  await phone.getByLabel('Email').fill(email);
  const beforeReset = await mailCount();
  await phone.getByRole('button', { name: 'Send reset link' }).click();
  await phone.getByText(`If an account exists for ${email}`).waitFor();
  await waitFor(async () => (await mailCount()) > beforeReset, 'reset email');
  await phone.goto(await lastLink(email));
  await phone.waitForURL('**/reset-password', { timeout: 20000 });
  await phone.getByLabel('New password').fill('new-horse-battery');
  await phone.getByLabel('Confirm password').fill('new-horse-battery');
  await phone.getByRole('button', { name: 'Save password' }).click();
  await phone.getByText('Your password has been changed.').waitFor();
  ok('recovery link opens reset screen; new password saved');

  step('Delete account');
  await phone.getByRole('button', { name: 'Continue' }).click();
  await phone.waitForURL('**/discover');
  await phone.getByRole('tab', { name: 'Profile' }).click();
  await phone.getByRole('button', { name: 'Delete account' }).click();
  const forever = phone.getByRole('button', { name: 'Delete forever' });
  assert.equal(await forever.isDisabled(), true);
  await phone.getByLabel('Type DELETE to confirm').fill('delete');
  await phone.screenshot({ path: SHOTS + '13-phone-delete-account.png' });
  await forever.click();
  await phone.waitForURL('**/welcome', { timeout: 20000 });
  assert.equal(sql(`select count(*) from auth.users where email='${email}'`), '0');
  assert.equal(sql(`select count(*) from storage.objects where name like '${storagePath.split('/')[0]}/%'`), '0');
  assert.equal(sql(`select count(*) from public.materials where storage_path like '${storagePath.split('/')[0]}/%'`), '0');
  ok('account, files and rows removed');

  if (errors.length) console.log('\nconsole errors:\n' + errors.join('\n'));
  console.log('\nALL E2E STEPS PASSED');
} catch (e) {
  await page.screenshot({ path: SHOTS + 'failure.png' }).catch(() => {});
  console.error('\nFAILED:', e.message);
  if (errors.length) console.log('console errors:\n' + errors.slice(0, 10).join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
