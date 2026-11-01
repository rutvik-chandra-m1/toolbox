import { useEffect, useRef, useState } from 'react';
import { ArrowDownAZ, CalendarDays, Camera, CircleAlert, FileOutput, Images, Info, Plus } from 'lucide-react';
import { isNativePlatform, keepScreenOn, pickFiles, useDropTarget } from '@/shared/files';
import { cn } from '@/shared/lib/cn';
import { createId } from '@/shared/lib/id';
import { Button, EmptyState, PageContainer } from '@/shared/ui';
import { ConvertProgress } from './components/ConvertProgress';
import { OptionsForm } from './components/OptionsForm';
import { PageList } from './components/PageList';
import { ResultCard } from './components/ResultCard';
import { CancelledError, ConversionError, convertImages, type Conversion, type Progress } from './converter';
import { EXIF_SEARCH_BYTES, readDateTaken } from './exif';
import { createImageProcessor, type ImageProcessor } from './imageProcessor';
import {
  ACCEPTED_TYPES,
  MAX_IMAGES,
  baseFilename,
  defaultOptions,
  movePage,
  rotateClockwise,
  selectImages,
  sortByDate,
  sortByName,
  type Options,
  type PageItem,
} from './logic';

type Phase = 'edit' | 'converting' | 'done';

async function toPage(file: File): Promise<PageItem> {
  let takenAt = file.lastModified;
  try {
    takenAt = readDateTaken(await file.slice(0, EXIF_SEARCH_BYTES).arrayBuffer()) ?? takenAt;
  } catch {
    // Unreadable: the thumbnail will say so; the file's date is fine until then.
  }
  return { id: createId(), file, rotation: 0, takenAt };
}

export default function ImagesToPdfPage() {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [options, setOptions] = useState<Options>(() => defaultOptions(new Date()));
  const [phase, setPhase] = useState<Phase>('edit');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Conversion | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const abort = useRef<AbortController | null>(null);
  const native = isNativePlatform();

  /* Thumbnails: made one at a time in a background worker, so 100 large photos are never in memory at once. */
  const processor = useRef<ImageProcessor | null>(null);
  const makingThumbnail = useRef(false);

  useEffect(() => {
    if (phase !== 'edit' || makingThumbnail.current) return;
    const next = pages.find((page) => !page.thumbnail && !page.broken);
    if (!next) return;

    makingThumbnail.current = true;
    processor.current ??= createImageProcessor();
    processor.current.thumbnail(next.file).then(
      (blob) => {
        makingThumbnail.current = false;
        update(next.id, { thumbnail: URL.createObjectURL(blob) });
      },
      () => {
        makingThumbnail.current = false;
        update(next.id, { broken: true });
      },
    );
  }, [pages, phase]);

  const pagesForCleanup = useRef(pages);
  pagesForCleanup.current = pages;
  useEffect(
    () => () => {
      abort.current?.abort();
      processor.current?.dispose();
      for (const page of pagesForCleanup.current) forgetThumbnail(page);
    },
    [],
  );

  function update(id: string, change: Partial<PageItem>) {
    setPages((current) => current.map((page) => (page.id === id ? { ...page, ...change } : page)));
  }

  async function add(files: File[]) {
    const { accepted, notes: picked } = selectImages(pages.length, files);
    setNotes(picked);
    setProblem(null);
    const added = await Promise.all(accepted.map(toPage));
    setPages((current) => [...current, ...added]);
  }

  async function choose(camera: boolean) {
    const files = await pickFiles(camera ? ['image/*'] : ACCEPTED_TYPES, { camera });
    if (files.length > 0) await add(files);
  }

  const busy = phase === 'converting';
  const drop = useDropTarget({ disabled: phase !== 'edit', onDropFiles: (files) => void add(files) });

  function remove(page: PageItem) {
    forgetThumbnail(page);
    setPages((current) => current.filter(({ id }) => id !== page.id));
  }

  function startOver() {
    pages.forEach(forgetThumbnail);
    setPages([]);
    setOptions(defaultOptions(new Date()));
    setResult(null);
    setProblem(null);
    setNotes([]);
    setPhase('edit');
  }

  async function convert() {
    if (busy || pages.length === 0) return;
    const controller = new AbortController();
    abort.current = controller;
    setProblem(null);
    setNotes([]);
    setPhase('converting');
    void keepScreenOn(true);

    try {
      const title = baseFilename(options.filename, new Date());
      setResult(await convertImages(pages, options, title, { onProgress: setProgress, signal: controller.signal }));
      setPhase('done');
    } catch (error) {
      if (error instanceof CancelledError) {
        setNotes(['Cancelled. Nothing was saved.']);
      } else {
        console.error(error);
        setProblem(error instanceof ConversionError ? error.message : 'The PDF could not be created. Please try again.');
      }
      setPhase('edit');
    } finally {
      setProgress(null);
      void keepScreenOn(false);
    }
  }

  const takePhoto = native && (
    <Button onClick={() => void choose(true)}>
      <Camera className="size-5" aria-hidden />
      Take photo
    </Button>
  );

  return (
    <PageContainer>
      <div
        role="region"
        aria-label="Images to PDF"
        {...drop.handlers}
        className={cn('space-y-5 rounded-2xl', drop.dragging && 'ring-2 ring-accent-500 ring-offset-8 ring-offset-transparent')}
      >
        {phase === 'done' && result ? (
          <ResultCard result={result} onConvertMore={startOver} onProblem={setProblem} />
        ) : busy ? (
          <ConvertProgress progress={progress} onCancel={() => abort.current?.abort()} />
        ) : pages.length === 0 ? (
          <EmptyState
            icon={Images}
            title="Choose images"
            description={`Up to ${MAX_IMAGES} JPG, PNG, WEBP or HEIC images.`}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" className="min-w-44" onClick={() => void choose(false)}>
                Choose images
              </Button>
              {takePhoto}
            </div>
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pages.length >= MAX_IMAGES} onClick={() => void choose(false)}>
                <Plus className="size-5" aria-hidden />
                Add more
              </Button>
              {takePhoto}
              <Button variant="ghost" onClick={() => setPages(sortByName)}>
                <ArrowDownAZ className="size-5" aria-hidden />
                By file name
              </Button>
              <Button variant="ghost" onClick={() => setPages(sortByDate)}>
                <CalendarDays className="size-5" aria-hidden />
                By date taken
              </Button>
            </div>

            <PageList
              pages={pages}
              onMove={(from, to) => setPages((current) => movePage(current, from, to))}
              onRotate={(page) => update(page.id, { rotation: rotateClockwise(page.rotation) })}
              onRemove={remove}
            />

            <OptionsForm options={options} onChange={setOptions} />

            <Button variant="primary" className="w-full" onClick={() => void convert()}>
              <FileOutput className="size-5" aria-hidden />
              Create PDF ({pages.length} {pages.length === 1 ? 'page' : 'pages'})
            </Button>
          </>
        )}

        {problem && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        )}

        {notes.map((note) => (
          <p
            key={note}
            role="status"
            className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {note}
          </p>
        ))}

        <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Every page shows the photo and holds its text, so you can select, search and copy it, and AI tools can read
            it. Everything happens on this device: your images are never uploaded.
          </span>
        </p>
      </div>
    </PageContainer>
  );
}

function forgetThumbnail(page: PageItem) {
  if (page.thumbnail) URL.revokeObjectURL(page.thumbnail);
}
