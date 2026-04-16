'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';

const buildStateKey = (href: string) => {
  if (typeof window === 'undefined') {
    return `__nav_state__:${href}`;
  }

  const url = new URL(href, window.location.origin);
  return `__nav_state__:${url.pathname}${url.search}`;
};

const persistNavigationState = (href: string, state: unknown) => {
  if (typeof window === 'undefined' || state === undefined) {
    return;
  }

  sessionStorage.setItem(buildStateKey(href), JSON.stringify(state));
};

const readNavigationState = (pathname: string, search: string) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = sessionStorage.getItem(`__nav_state__:${pathname}${search}`);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

type NavigateOptions = {
  replace?: boolean;
  state?: unknown;
};

type LinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  to: string;
  state?: unknown;
};

export function BrowserRouter({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Routes({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Route() {
  return null;
}

export function useNavigate() {
  const router = useRouter();

  return (to: string | number, options: NavigateOptions = {}) => {
    if (typeof to === 'number') {
      if (to < 0) {
        router.back();
      } else if (to > 0) {
        router.forward();
      }

      return;
    }

    persistNavigationState(to, options.state);

    if (options.replace) {
      router.replace(to);
      return;
    }

    router.push(to);
  };
}

export function useLocation() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  const [state, setState] = useState<unknown>(null);

  useEffect(() => {
    setState(readNavigationState(pathname, search));
  }, [pathname, search]);

  return {
    pathname,
    search,
    state,
  };
}

export function NavLink({ to, state, onClick, ...props }: LinkProps) {
  return (
    <Link
      href={to}
      onClick={(event) => {
        persistNavigationState(to, state);
        onClick?.(event as MouseEvent<HTMLAnchorElement>);
      }}
      {...props}
    />
  );
}

export { NavLink as Link };
