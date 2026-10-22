import {
  INSTALL_PROMPT_CAPTURE_SCRIPT,
  decideInstallSituation,
  hasInstallPrompt,
  isIOSDevice,
  promptInstall,
  subscribeInstallPrompt,
  type InstallSignals,
} from '@/lib/installState'

const base: InstallSignals = { standalone: false, ios: false, promptAvailable: false, outcome: null }

describe('decideInstallSituation (#595)', () => {
  it('offers the browser install window when a prompt is available', () => {
    expect(decideInstallSituation({ ...base, promptAvailable: true })).toBe('prompt')
  })

  it('falls back to menu instructions without a prompt', () => {
    expect(decideInstallSituation(base)).toBe('manual')
  })

  it('links to Mon député when running as the installed web app', () => {
    expect(decideInstallSituation({ ...base, standalone: true, promptAvailable: true })).toBe('installed')
    expect(decideInstallSituation({ ...base, standalone: true, ios: true })).toBe('installed')
  })

  it('keeps the site reachable after the visitor cancels', () => {
    expect(decideInstallSituation({ ...base, outcome: 'dismissed' })).toBe('dismissed')
  })

  it('reports an accepted install', () => {
    expect(decideInstallSituation({ ...base, outcome: 'accepted' })).toBe('accepted')
  })

  it('never offers a web install on iPhone or iPad', () => {
    expect(decideInstallSituation({ ...base, ios: true })).toBe('ios')
    expect(decideInstallSituation({ ...base, ios: true, promptAvailable: true })).toBe('ios')
  })
})

describe('isIOSDevice', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
  const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'

  it('detects iPhone from the user agent', () => {
    expect(isIOSDevice(IPHONE, 5)).toBe(true)
  })

  it('detects an iPad presenting itself as a Mac by its touch points', () => {
    expect(isIOSDevice(IPADOS, 5)).toBe(true)
    expect(isIOSDevice(IPADOS, 0)).toBe(false)
  })

  it('leaves Android alone', () => {
    expect(isIOSDevice(ANDROID, 5)).toBe(false)
  })
})

describe('install prompt capture', () => {
  beforeAll(() => {
    // What the root layout runs before hydration.
    new Function(INSTALL_PROMPT_CAPTURE_SCRIPT)()
  })

  function firePrompt(outcome: 'accepted' | 'dismissed') {
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: jest.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome }),
    })
    window.dispatchEvent(event)
    return event
  }

  it('keeps a prompt fired before any subscriber and notifies later ones', () => {
    const event = firePrompt('accepted')
    expect(hasInstallPrompt()).toBe(true)
    expect(event.defaultPrevented).toBe(false)

    const onChange = jest.fn()
    const unsubscribe = subscribeInstallPrompt(onChange)
    window.dispatchEvent(new Event('appinstalled'))
    expect(onChange).toHaveBeenCalled()
    expect(hasInstallPrompt()).toBe(false)
    unsubscribe()
  })

  it('uses the prompt once and returns the visitor choice', async () => {
    const event = firePrompt('dismissed')
    await expect(promptInstall()).resolves.toBe('dismissed')
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(hasInstallPrompt()).toBe(false)
    await expect(promptInstall()).resolves.toBe('unavailable')
  })
})
