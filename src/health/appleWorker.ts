/// <reference lib="webworker" />
import { Unzip, UnzipInflate } from 'fflate';
import { AppleHealthParser } from './apple';
import type { HealthCategory } from '@/db/types';

interface Msg {
  file: File;
  categories: HealthCategory[];
  fromDay: string | null;
}

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<Msg>) => {
  const { file, categories, fromDay } = e.data;
  const parser = new AppleHealthParser(categories, fromDay);
  const decoder = new TextDecoder('utf-8');
  let read = 0;
  let foundXml = false;
  const total = file.size;
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const isZip = head[0] === 0x50 && head[1] === 0x4b;
    const reader = file.stream().getReader();

    if (!isZip) {
      foundXml = true;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        read += value.length;
        parser.push(decoder.decode(value, { stream: true }));
        post({ type: 'progress', read, total, records: parser.records });
      }
      parser.push(decoder.decode());
    } else {
      const unzip = new Unzip((entry) => {
        // export.xml only (export_cda.xml contains clinical documents, not needed)
        if (/(^|\/)export\.xml$/.test(entry.name)) {
          foundXml = true;
          entry.ondata = (err, chunk, final) => {
            if (err) throw err;
            parser.push(decoder.decode(chunk, { stream: !final }));
          };
          entry.start();
        }
      });
      unzip.register(UnzipInflate);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          unzip.push(new Uint8Array(0), true);
          break;
        }
        read += value.length;
        unzip.push(value);
        post({ type: 'progress', read, total, records: parser.records });
      }
    }
    if (!foundXml) throw new Error('In der ZIP-Datei wurde keine export.xml gefunden. Bitte die Datei „Export.zip“ aus der Health-App wählen.');
    post({ type: 'done', result: parser.finish() });
  } catch (err) {
    post({ type: 'error', message: (err as Error).message || String(err) });
  }
};
