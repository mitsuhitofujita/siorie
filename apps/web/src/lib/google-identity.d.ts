// Minimal ambient types for the parts of Google Identity Services this app
// uses, hand-written rather than pulled from an npm package (the same
// approach already used for the shadcn/ui primitives in this repo).
// https://developers.google.com/identity/gsi/web/reference/js-reference

export {}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string
            callback: (response: { credential: string }) => void
          }): void
          renderButton(
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon'
              theme?: 'outline' | 'filled_blue' | 'filled_black'
              size?: 'large' | 'medium' | 'small'
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
              shape?: 'rectangular' | 'pill' | 'circle' | 'square'
              logo_alignment?: 'left' | 'center'
              locale?: string
            },
          ): void
        }
      }
    }
  }
}
