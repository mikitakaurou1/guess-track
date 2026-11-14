export const ADMIN_LOGIN_EVENT = 'guesstrack:admin-login';
export const openAdminLogin = (): void => {
  window.dispatchEvent(new Event(ADMIN_LOGIN_EVENT));
};
