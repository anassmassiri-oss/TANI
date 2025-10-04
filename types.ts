import { ASPECT_RATIOS } from './constants';

export type AspectRatio = keyof typeof ASPECT_RATIOS;

export type EditMode = 'generate' | 'edit';
