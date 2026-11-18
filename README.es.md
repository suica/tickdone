<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="TickDone"></p>

<h1 align="center">TickDone</h1>

<p align="center">Lista de tareas y gestor del tiempo que funciona en tu navegador: tareas, calendario, matriz de Eisenhower, temporizador de concentración y seguimiento de hábitos.</p>

<p align="center"><a href="https://tickdone.pages.dev"><b>Abrir TickDone → tickdone.pages.dev</b></a></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <b>Español</b> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.ru.md">Русский</a>
</p>

![Tareas con el panel de detalles abierto](docs/screenshots/desktop-tasks.png)

| Calendario | Matriz de Eisenhower |
|---|---|
| ![Calendario](docs/screenshots/desktop-calendar.png) | ![Matriz de Eisenhower](docs/screenshots/desktop-matrix.png) |
| **Temporizador de concentración** | **Seguimiento de hábitos** |
| ![Temporizador de concentración](docs/screenshots/desktop-pomo.png) | ![Seguimiento de hábitos](docs/screenshots/desktop-habit.png) |

## Funciones

- **Tareas**: Bandeja de entrada, Hoy, Mañana, Próximos 7 días, Todas, Completadas, Descartadas y Papelera; tus propias listas, carpetas y etiquetas; subtareas, notas, prioridades, fechas y horas de vencimiento, recordatorios y reglas de repetición; tareas fijadas; menú contextual en cada tarea; deshacer tras completar o eliminar.
- **Entrada rápida** que entiende lo que escribes y lo resalta: `call mom tomorrow 3pm !high #family ~Personal` asigna fecha, hora, prioridad, etiqueta y lista en una sola línea.
- **Vistas de lista y kanban**, con agrupación y ordenación.
- **Calendario** con vistas de mes, semana y día.
- **Matriz de Eisenhower** para clasificar las tareas según su urgencia e importancia.
- **Temporizador de concentración** con modos Pomodoro y cronómetro, y un historial de sesiones anteriores.
- **Seguimiento de hábitos** con registros, rachas y estadísticas.
- **Búsqueda**, atajos de teclado y tema oscuro.

Tus datos se quedan en tu navegador (localStorage). No hay cuentas y no se envía nada a ningún servidor.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `N` | Nueva tarea |
| `Ctrl/⌘ F` | Buscar |
| `Alt 1`–`Alt 6` | Cambiar de módulo |
| `Ctrl/⌘ Z` | Deshacer, mientras se muestra el aviso para deshacer |
| `Esc` | Cerrar los detalles de la tarea |
| `?` | Ver todos los atajos |

## Desarrollo

Requiere Node.js 24.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

Hecho con React 19, TypeScript, Vite y date-fns.

## Despliegue

El sitio en producción está alojado en Cloudflare Pages:

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## Cómo contribuir

Las issues y los pull requests son bienvenidos. Lee primero [AGENTS.md](AGENTS.md): ahí están las reglas del proyecto (el inglés como idioma de trabajo, traducciones a todos los idiomas admitidos, diseño adaptable, convenciones de animación y de arrastrar y soltar, y la CI que debe superar cada PR).

## Licencia

[MIT](LICENSE)
