import fs from 'fs';

try {
  if (fs.existsSync('./dist')) {
    fs.rmSync('./dist', { recursive: true, force: true });
    console.log('Successfully cleaned the dist directory.');
  } else {
    console.log('No dist directory found to clean.');
  }
} catch (error) {
  console.error('Error cleaning dist directory:', error);
}
