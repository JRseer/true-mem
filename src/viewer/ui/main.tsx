import { render } from 'preact';
import { App } from './App.js';
import './styles/index.css';

const root = document.getElementById('app');
if (!root) throw new Error('Viewer root element #app not found');
render(<App />, root);
