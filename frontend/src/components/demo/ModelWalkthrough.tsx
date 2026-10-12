import { useState } from 'react';
import { Brain, ChevronRight, FileCheck2, Gauge, Layers, Database, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MlStatus } from '@/lib/types';

interface Step { id: string; title: string; icon: typeof Brain; summary: string; facts: Array<[string, string]> }

function steps(model?: MlStatus['model']): Step[] {
  return [
    {
      id: 'validate', title: 'Validate upload', icon: FileCheck2,
      summary: 'The Node API checks the file before any pixel is decoded, then the ML service fully decodes it so truncated files fail early.',
      facts: [['Signature', 'PNG / JPEG magic bytes (extension and MIME header are not trusted)'], ['Size limit', '≤ 8 MB'], ['Dimensions', '32 – 8192 px per side, ≤ 40 megapixels'], ['Storage', 'Bytes via StorageProvider; metadata and SHA-256 in MySQL']],
    },
    {
      id: 'preprocess', title: 'Preprocess', icon: Layers,
      summary: 'Deterministic transforms matching the torchvision weights’ training recipe. Using different statistics would silently degrade outputs.',
      facts: [['Colour', 'RGB (alpha composited on white, 16-bit scaled)'], ['Resize', 'Shorter side → 256 px, bicubic'], ['Crop', 'Centre 224 × 224'], ['Scale', 'uint8 → float32 ÷ 255'], ['Normalise', 'mean (0.485, 0.456, 0.406) · std (0.229, 0.224, 0.225)'], ['Tensor', '[1, 3, 224, 224] float32, NCHW']],
    },
    {
      id: 'model', title: 'EfficientNet-B0', icon: Brain,
      summary: 'A compact convolutional network built from mobile inverted-bottleneck (MBConv) blocks with squeeze-and-excitation, run on CPU with torch.inference_mode.',
      facts: [
        ['Implementation', model?.architecture ?? 'torchvision.models.efficientnet_b0'],
        ['Parameters', model ? `${model.num_parameters.toLocaleString()} (${(model.num_parameters / 1e6).toFixed(2)} M)` : '≈ 5.29 M'],
        ['Input', model ? `${model.input_size.join(' × ')} px RGB` : '224 × 224 px RGB'],
        ['Weights', model?.weights_source ?? 'torchvision IMAGENET1K_V1'],
        ['Trained on', model?.trained_task ?? 'ImageNet-1k general object classification (not medical)'],
        ['Clinically validated', 'No'],
      ],
    },
    {
      id: 'output', title: 'Softmax & top-5', icon: Gauge,
      summary: 'Logits become probabilities over the 1,000 ImageNet classes; the five highest are returned with timings and metadata.',
      facts: [['Output', '1,000-way softmax → top-5 labels'], ['Calibration', 'None — probabilities are not diagnostic confidence'], ['Meaning', 'Everyday-object categories (e.g. “spotlight”), not medical findings'], ['Timing', 'Inference and total duration recorded per run']],
    },
    {
      id: 'persist', title: 'Persist & audit', icon: Database,
      summary: 'Every outcome — success, failure or unavailable weights — becomes an AnalysisResult row; nothing is fabricated when the model cannot run.',
      facts: [['Stored', 'Status, mode, model/version, predictions JSON, preprocessing JSON, timings, error'], ['Context', 'Selected clinical records are snapshotted for reviewers; the image model never reads them'], ['Audit', 'Activity log entry for the requesting user']],
    },
  ];
}

export function ModelWalkthrough({ model }: { model?: MlStatus['model'] }) {
  const list = steps(model);
  const [active, setActive] = useState(list[0].id);
  const current = list.find((s) => s.id === active) ?? list[0];
  const Icon = current.icon;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inference workflow</CardTitle>
        <CardDescription>How the full application turns an uploaded image into a recorded result. Select a step.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-wrap items-center gap-1.5" aria-label="Inference pipeline steps">
          {list.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActive(s.id)}
                aria-pressed={active === s.id}
                className={cn('rounded-md border px-3 py-1.5 text-xs font-medium transition-colors', active === s.id ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted')}
              >
                {i + 1}. {s.title}
              </button>
              {i < list.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-md border p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" aria-hidden /> {current.title}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{current.summary}</p>
          <dl className="mt-3 divide-y text-sm">
            {current.facts.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-6">
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="font-medium sm:text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          Research prototype only. Not intended for clinical diagnosis, treatment, or patient care.
        </p>
      </CardContent>
    </Card>
  );
}
