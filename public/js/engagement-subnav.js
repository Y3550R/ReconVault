import { renderHeader } from './layout.js';
import { getCurrentUser, isAdmin } from "./auth.js";

async function initialize() {
  const currentUser = await getCurrentUser();
  const admin = isAdmin(currentUser);
  renderHeader({ user: currentUser });

  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  const engagementIndex = parts.indexOf('engagements');
  const engagementId = engagementIndex >= 0 ? parts[engagementIndex + 1] : null;
  if (!engagementId) return;

  const base = `/engagements/${encodeURIComponent(engagementId)}`;
  const links = [
    { href: '/engagements', label: '← Engagements', key: 'back' },
    { href: base, label: 'Dashboard', key: 'dashboard' },
    ...(admin
    ? [{ href: `${base}/members`, label: 'Members', key: 'members' }]
    : []),
    { href: `${base}/targets`, label: 'Targets', key: 'targets' },
    { href: `${base}/findings`, label: 'Findings', key: 'findings' },
    { href: `${base}/scans`, label: 'Scans', key: 'scans' },
  ];

  let nav = document.querySelector('[data-engagement-subnav]');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'rv-engagement-subnav';
    nav.setAttribute('aria-label', 'Engagement navigation');
    nav.setAttribute('data-engagement-subnav', '');
    const topbar = document.querySelector('[data-existing-topbar], header');
    if (topbar?.parentNode) topbar.insertAdjacentElement('afterend', nav);
    else document.body.prepend(nav);
  }

  const activeKey = parts.includes('members') ? 'members'
    : parts.includes('targets') ? 'targets'
    : parts.includes('findings') ? 'findings'
    : parts.includes('scans') ? 'scans'
    : 'dashboard';

  nav.innerHTML = links.map(({ href, label, key }) => {
    const active = key === activeKey ? ' active' : '';
    const back = key === 'back' ? ' rv-back-link' : '';
    const current = key === activeKey ? ' aria-current="page"' : '';
    return `<a class="${(key === 'back' ? 'rv-back-link' : '').trim()}${active}" href="${href}"${current}>${label}</a>`;
  }).join('');
};

initialize();
