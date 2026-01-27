import App from './App.svelte';
import { mount } from 'svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
// v2 - force sw update Mon Jan 26 15:25:47 PST 2026
