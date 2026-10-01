import './styles.css';
import { aplicarTema, temaActual } from './core/tema';
import { montarApp } from './ui/app';

aplicarTema(temaActual());
const raiz = document.getElementById('app');
if (!raiz) throw new Error('Falta el contenedor #app');
montarApp(raiz);
