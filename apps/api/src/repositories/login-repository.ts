import type { RuntimeEnv } from './settings-repository.ts';
export interface LoginTokens { access_token: string; refresh_token: string }
export interface LoginRepository { signIn(login: string, password: string): Promise<LoginTokens> }
export type LoginFactory = (env: RuntimeEnv) => LoginRepository;
