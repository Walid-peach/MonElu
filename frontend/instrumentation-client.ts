import * as Sentry from '@sentry/nextjs'

import { scrubBreadcrumb, scrubSpan } from '@/lib/sentryPrivacy'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'production',
  tracesSampleRate: 0.1,
  // An address or a postal code typed to find one's deputy never reaches
  // Sentry, in a breadcrumb or a span (ADR-047 §4).
  beforeBreadcrumb: breadcrumb => scrubBreadcrumb(breadcrumb),
  beforeSendSpan: span => scrubSpan(span),
})
