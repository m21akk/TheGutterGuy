// /api/admin/jobs
//   GET            – every job (for the list and the diary)
//   GET ?id=...    – one job, with photo links
//   PATCH          – update date / status / notes for a job
import { route, json, fail, clean, readJson } from '../../util.js';
import { requireAdmin } from '../../auth.js';
import { listJobs, getJob, updateJob, signedPhotoUrls } from '../../db.js';
import { bookingConfirmed } from '../../email.js';

const STATUSES = ['new', 'quoted', 'paid', 'completed', 'cancelled'];

export const GET = route(async (request) => {
  await requireAdmin(request);
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const job = await getJob(id);
    if (!job) return fail('Job not found', 404);
    job.photo_urls = await signedPhotoUrls(job.photos || []);
    return json({ job });
  }
  return json({ jobs: await listJobs() });
});

export const PATCH = route(async (request) => {
  await requireAdmin(request);
  const b = await readJson(request, 50_000);
  const job = await getJob(b.id);
  if (!job) return fail('Job not found', 404);

  const patch = {};
  if ('scheduled_date' in b) {
    if (b.scheduled_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.scheduled_date)) return fail('Bad date');
    patch.scheduled_date = b.scheduled_date || null;
  }
  if ('scheduled_slot' in b) patch.scheduled_slot = ['am', 'pm', 'any'].includes(b.scheduled_slot) ? b.scheduled_slot : null;
  if ('admin_notes' in b) patch.admin_notes = clean(b.admin_notes, 4000);
  if ('status' in b) {
    if (!STATUSES.includes(b.status)) return fail('Bad status');
    patch.status = b.status;
    if (b.status === 'completed') patch.completed_at = new Date().toISOString();
  }

  const updated = await updateJob(job.id, patch);
  if (b.notify && updated.scheduled_date) await bookingConfirmed(updated);
  return json({ job: updated });
});
