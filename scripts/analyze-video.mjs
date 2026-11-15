import ZAI from 'z-ai-web-dev-sdk';
import { readFileSync, writeFileSync } from 'fs';

const VIDEO_PATH = '/home/z/my-project/upload/apsis.mp4';

async function main() {
  const zai = await ZAI.create();
  const videoBase64 = readFileSync(VIDEO_PATH).toString('base64');
  const dataUrl = `data:video/mp4;base64,${videoBase64}`;

  const prompt = process.argv[2] || 'Describe this mobile app screen recording in detail.';

  console.log('Analyzing video (this may take a while)...');
  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'video_url', video_url: { url: dataUrl } }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  const content = response.choices[0]?.message?.content || 'No content';
  writeFileSync(process.argv[3] || '/home/z/my-project/video-analysis.txt', content);
  console.log(content);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
