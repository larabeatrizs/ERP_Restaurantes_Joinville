export const passwordHint = 'Pelo menos 8 caracteres, com uma letra maiúscula ou minúscula, um número e um símbolo.';
export function validPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password) && /[!@#$%^&*()_+\-=\[\]{};'":\\|<>?,./`~]/.test(password);
}
