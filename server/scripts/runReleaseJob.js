import { connectToDatabase } from '../config/db.js';
import { processScheduledReleases } from '../services/releaseService.js';

try {
  await connectToDatabase();
  const releasedCount = await processScheduledReleases();
  console.log(`Manual release job processed ${releasedCount} employee(s)`);
  process.exit(0);
} catch (error) {
  console.error('Manual release job failed:', error);
  process.exit(1);
}
