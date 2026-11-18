import path from 'node:path';

/**
 * Intelligently maps any file path to a human-readable Page, Screen, API, or Component name.
 */
export function mapFilePathToPage(filePath: string): string {
  // Normalize slashes
  const normalized = filePath.replace(/\\/g, '/');

  // Next.js App Router (app/**/page.tsx, app/**/route.ts)
  const appPageMatch = normalized.match(/(?:^|\/)app\/(.+?)\/(?:page|layout|loading|error)\.[jt]sx?$/i);
  if (appPageMatch) {
    const routeSegments = appPageMatch[1]
      .split('/')
      .filter(s => !s.startsWith('(') && !s.endsWith(')')) // Remove route groups like (dashboard)
      .join('/');
    return `Page: /${routeSegments || 'home'}`;
  }

  const appRouteMatch = normalized.match(/(?:^|\/)app\/(.+?)\/route\.[jt]sx?$/i);
  if (appRouteMatch) {
    return `API: /${appRouteMatch[1]}`;
  }

  // Next.js Pages Router (pages/**)
  const pagesMatch = normalized.match(/(?:^|\/)pages\/(.+?)\.[jt]sx?$/i);
  if (pagesMatch) {
    let route = pagesMatch[1];
    if (route.endsWith('/index') || route === 'index') {
      route = route.replace(/\/index$/, '') || 'home';
    }
    if (route.startsWith('api/')) {
      return `API: /${route}`;
    }
    return `Page: /${route}`;
  }

  // Views / Screens (React, Vue, React Native, Angular)
  const viewMatch = normalized.match(/(?:^|\/)(?:views|screens|containers)\/([^/]+)/i);
  if (viewMatch) {
    return `Page: ${formatName(viewMatch[1])}`;
  }

  // Components
  const componentMatch = normalized.match(/(?:^|\/)components\/(?:[^/]+\/)?([^/]+)\.[jt]sx?$/i);
  if (componentMatch) {
    return `Component: ${formatName(componentMatch[1])}`;
  }

  // C# Razor Pages / Blazor (.razor, .cshtml)
  const razorMatch = normalized.match(/(?:^|\/)Pages\/(.+?)\.(?:razor|cshtml)$/i);
  if (razorMatch) {
    return `Page: ${razorMatch[1].replace(/\//g, ' > ')}`;
  }

  // C# Controllers (Controllers/*Controller.cs)
  const controllerMatch = normalized.match(/(?:^|\/)Controllers\/(.+?)Controller\.cs$/i);
  if (controllerMatch) {
    return `API: ${controllerMatch[1]} Controller`;
  }

  // C# Minimal API / Endpoints
  const endpointMatch = normalized.match(/(?:^|\/)Endpoints\/(.+?)\.cs$/i);
  if (endpointMatch) {
    return `Endpoint: ${endpointMatch[1]}`;
  }

  // Services
  const serviceMatch = normalized.match(/(?:^|\/)Services?\/(.+?)(?:Service)?\.[a-z]+$/i);
  if (serviceMatch) {
    return `Service: ${formatName(serviceMatch[1])}`;
  }

  // Repositories / Data Access
  const repoMatch = normalized.match(/(?:^|\/)Repositories?\/(.+?)\.[a-z]+$/i);
  if (repoMatch) {
    return `Repository: ${formatName(repoMatch[1])}`;
  }

  // Store / Hooks / Utils
  if (normalized.includes('/hooks/') || normalized.match(/use[A-Z]/)) {
    const base = path.basename(filePath, path.extname(filePath));
    return `Hook: ${base}`;
  }

  if (normalized.includes('/store/') || normalized.includes('/state/')) {
    const base = path.basename(filePath, path.extname(filePath));
    return `State/Store: ${base}`;
  }

  // Fallback: use directory name or file base name
  const dirName = path.basename(path.dirname(filePath));
  const fileName = path.basename(filePath);
  if (dirName && dirName !== '.' && dirName !== 'src') {
    return `Module: ${formatName(dirName)}`;
  }

  return `File: ${fileName}`;
}

function formatName(raw: string): string {
  // Convert camelCase or kebab-case to Title Case
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase());
}
