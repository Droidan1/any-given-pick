import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk attaches session state here. Authorization remains colocated with every
// protected page, route handler, and Server Action so path matching is never a
// security boundary.
export default clerkMiddleware({
  frontendApiProxy: {
    enabled: Boolean(process.env.NEXT_PUBLIC_CLERK_PROXY_URL),
  },
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
