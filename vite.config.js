import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the build works at a root domain, under a
  // subpath, or straight off the filesystem
  base: './',
});
