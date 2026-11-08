# Third-party component notices

The Better Auth UI shadcn components were installed from its official `radix-nova` registry on 7 November 2026, starting from the adapted copies used in Suggestions. They are copied into `apps/web/src/components/auth`, `apps/web/src/components/ui` and `apps/web/src/lib/auth`, as intended by the shadcn distribution model. Local adaptations connect TanStack Router, restrict every redirect to same-site paths, remove sign-up links (Cabmate is invite-only), return sign-out to the app home, and keep the email-code card's tab-scoped email/request-time recovery, wall-clock cooldown/expiry, explicit code verification and generic invited-driver message. Successful sign-in opens Your cab (`/profile`). The password sign-in, email code, magic link, forgot/reset password, change password, passkeys, auth router and user button components are used; social, sign-up, email-change and account-profile views are not. The shadcn InputOTP icon placeholder is replaced with the configured Lucide icon, and the components are restyled with Cabmate's dark palette and amber accent.

## Better Auth UI

Source: https://raw.githubusercontent.com/better-auth-ui/better-auth-ui/main/LICENSE

```text
MIT License

Copyright (c) 2025 daveycodez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## shadcn/ui

Source: https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
