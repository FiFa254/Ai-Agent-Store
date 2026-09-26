import type { SessionUser } from '@shared/types';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionTokenHash?: string;
    }
  }
}

export {};
