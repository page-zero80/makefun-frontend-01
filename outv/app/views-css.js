// Injects the view stylesheet once, on the first lazy route. The top-level
// await lets the router hold a view back until its styles have arrived.

let link = document.querySelector('link[data-views]');
if (!link) {
  link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'views.css';
  link.dataset.views = '';
  await new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    document.head.append(link);
  });
}
