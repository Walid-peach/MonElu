// The phone menu drawer lives in MobileTopBar; anything else (the homepage
// hero's own ☰) opens it through this event, as openGlobalSearch() does for
// the search overlay.
export const OPEN_MOBILE_MENU_EVENT = 'monelu:open-mobile-menu'

export function openMobileMenu() {
  window.dispatchEvent(new Event(OPEN_MOBILE_MENU_EVENT))
}
