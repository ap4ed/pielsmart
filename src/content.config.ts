import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pillar: z.enum(['skincare', 'maquillaje', 'cabello', 'unas', 'perfumes', 'dispositivos']),
    type: z.enum(['informational', 'roundup', 'comparison', 'review']),
    targetKeyword: z.string(),
    datePublished: z.string(),
    dateModified: z.string().optional(),
  }),
});

export const collections = { articles };
