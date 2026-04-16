export const isTrustedAuthMessage = (origin: string) => {
  if (typeof window === 'undefined') {
    return false;
  }

  return origin === window.location.origin;
};
