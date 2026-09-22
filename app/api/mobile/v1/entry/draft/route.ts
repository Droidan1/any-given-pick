import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { saveEntryDraft } from "@/app/entry-actions";
import type { EntryMutationInput } from "@/lib/entries/types";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const input = await request.json() as EntryMutationInput;
    const result = await saveEntryDraft(input);
    return NextResponse.json({ result }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({
      result: {
        ok: false,
        code: "invalid_input",
        message: "The entry data was not valid.",
      },
    }, { status: 400 });
  }
}
