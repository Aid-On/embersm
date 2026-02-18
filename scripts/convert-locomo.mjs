import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = (...args) => { process.stdout.write(args.map(String).join(' ') + '\n'); };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, '../../embersm/benchmark-data/locomo10.json');
const destPath = path.join(__dirname, '../benchmark-data/locomo100.json');

const raw = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));

const categoryMap = {
  1: 'single_hop',
  2: 'single_hop',
  3: 'multi_hop',
  4: 'temporal',
  5: 'open_domain',
  6: 'adversarial'
};

const conversations = [];
const questions = [];

const sample = raw[0];
const convId = `conv_${sample.sample_id}`;

const sessionKeys = Object.keys(sample.conversation)
  .filter(k => !k.includes('date_time'))
  .sort((a, b) => {
    const numA = parseInt(a.split('_')[1]);
    const numB = parseInt(b.split('_')[1]);
    return numA - numB;
  });

const messages = [];
const speakers = new Set();

for (const key of sessionKeys) {
  const session = sample.conversation[key];
  const dateTimeKey = `${key}_date_time`;
  const dateTime = sample.conversation[dateTimeKey] || '';

  if (Array.isArray(session)) {
    for (const turn of session) {
      if (turn.speaker && turn.text) {
        speakers.add(turn.speaker);

        let content = `[${turn.speaker}]: ${turn.text}`;
        if (dateTime) {
          content = `[Date: ${dateTime}] ${content}`;
        }

        messages.push({
          role: messages.length % 2 === 0 ? 'user' : 'assistant',
          content
        });
      }
    }
  }
}

log(`Speakers found: ${Array.from(speakers).join(', ')}`);
log(`Messages extracted: ${messages.length}`);
log(`Sessions with dates: ${sessionKeys.filter(k => sample.conversation[`${k}_date_time`]).length}`);

conversations.push({ id: convId, messages: messages.slice(0, 300) });

const qaList = sample.qa.slice(0, 100);
for (let i = 0; i < qaList.length; i++) {
  const qa = qaList[i];
  questions.push({
    id: `q_${String(i + 1).padStart(3, '0')}`,
    conversation_id: convId,
    question: qa.question,
    answer: String(qa.answer),
    category: categoryMap[qa.category] || 'single_hop'
  });
}

fs.mkdirSync(path.dirname(destPath), { recursive: true });
fs.writeFileSync(destPath, JSON.stringify({ conversations, questions }, null, 2));

log(`Converted: ${conversations.length} conversations, ${questions.length} questions`);
log(`Saved to: ${destPath}`);
