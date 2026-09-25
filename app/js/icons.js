// Inline SVG icons (stroke = currentColor, so they follow the theme).
// All are decorative: pair them with visible text, never use them alone.

const svg = (body, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  done: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>', 'status-icon'),
  progress: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>', 'status-icon'),
  todo: svg('<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>', 'status-icon'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  retry: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>'),
  alert: svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>'),
  // activity feed
  post: svg('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12.5h5"/>'),
  photo: svg('<rect x="3.5" y="5" width="17" height="14" rx="1"/><circle cx="9" cy="10" r="1.75"/><path d="M20.5 16l-5-5-8.5 8"/>'),
  review_reply: svg('<path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>'),
  profile_update: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  q_and_a: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/>'),
  fix: svg('<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
  note: svg('<path d="M6 3.5h9l3 3v14H6z"/><path d="M9 11h6M9 14.5h6"/>'),
  request_done: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>'),
};
