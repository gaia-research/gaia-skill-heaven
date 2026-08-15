#!/usr/bin/env node
/**
 * Authority-only feasibility record for the missing Lucy component paths.
 *
 * It performs no raster generation, mask invention, crop export, or source
 * mutation.  The supplied final panels are flattened presentation artwork, so
 * this script records why their visible details cannot truthfully become clean
 * reusable alpha components.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const auditRoot = resolve(root, 'packages/site/assets/workbench/lucy/AUTHORITY-COMPONENTS/audit');
mkdirSync(auditRoot, { recursive: true });

const evidence = {
  script: 'scripts/assets/lucy-authority-components-export.mjs',
  mode: 'authority-only feasibility review; no production component exports',
  inspected: [
    'packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_Model_Turnaround_reference.png',
    'packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_Katana_reference.png',
    'packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_ZERO_reference_panel.png',
    'packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_HEAVEN_reference_panel.png',
    'packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_HELL_reference_panel.png',
    'packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_ULTRA_reference_panel.png',
  ],
  rejectedTrialAudits: [
    'authority-hair-normal-checker.png',
    'authority-hair-inverted-checker.png',
  ],
  blocked: {
    'components/hair/lucy-hair-neutral.webp': 'The model-turnaround back hair is flattened together with the sailor collar and adjacent models; a clean alpha mask would cut garment pixels or retain presentation pixels.',
    'components/hair/lucy-hair-upward.webp': 'The Heaven hair flow is flattened into overlapping cyan shard-wing geometry; the hair silhouette is not independently present.',
    'components/hair/lucy-hair-inverted.webp': 'The Hell hair flow is flattened into face/forehead and fragmented wing/shard pixels; there is no separable full hair geometry.',
    'components/hair/lucy-hair-ultra.webp': 'The Ultra gold hair flow is flattened into face and gold shard-wing geometry; the hair silhouette is not independently present.',
    'components/katana/lucy-katana-sheathed.webp': 'The approved katana panel contains two unsheathed blades and a handle close-up; the model/panel views do not contain one complete isolated sheathed katana.',
    'components/katana/lucy-katana-saya.webp': 'No complete saya is visible in the supplied final authority panels. The GEN-05 saya is additionally occluded by Lucy\'s legs.',
  },
};

writeFileSync(resolve(auditRoot, 'authority-components-feasibility.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
