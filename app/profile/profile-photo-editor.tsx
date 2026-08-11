"use client";

import { useUser } from "@clerk/nextjs";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadState = {
  status: "idle" | "uploading" | "success" | "error";
  message: string;
};

export function ProfilePhotoEditor() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    message: "JPG, PNG, or WebP. Maximum file size: 5 MB.",
  });

  async function uploadPhoto(file: File) {
    if (!user) {
      setUploadState({ status: "error", message: "Your account is still loading. Try again." });
      return;
    }

    if (!ACCEPTED_PHOTO_TYPES.has(file.type)) {
      setUploadState({ status: "error", message: "Choose a JPG, PNG, or WebP image." });
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setUploadState({ status: "error", message: "Choose an image smaller than 5 MB." });
      return;
    }

    setUploadState({ status: "uploading", message: "Uploading your photo…" });
    try {
      await user.setProfileImage({ file });
      await user.reload();
      setUploadState({ status: "success", message: "Profile photo updated." });
      router.refresh();
    } catch {
      setUploadState({
        status: "error",
        message: "That photo could not be uploaded. Try a different image.",
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="profile-photo-card" aria-labelledby="profile-photo-title">
      <span
        className="profile-photo-card__preview"
        role="img"
        aria-label="Current profile photo"
        style={user?.imageUrl ? { backgroundImage: `url(${JSON.stringify(user.imageUrl)})` } : undefined}
      />
      <div className="profile-photo-card__copy">
        <p className="card-kicker">Roster photo</p>
        <h2 id="profile-photo-title">Add your profile photo</h2>
        <p>Your photo appears with your Any Given Pick account and helps other players recognize you.</p>
        <p
          className={`profile-photo-card__status${uploadState.status === "error" ? " profile-photo-card__status--error" : ""}`}
          aria-live="polite"
        >
          {uploadState.message}
        </p>
      </div>
      <div className="profile-photo-card__action">
        <input
          ref={inputRef}
          id="profile-photo-input"
          className="profile-photo-card__input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={!isLoaded || uploadState.status === "uploading"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadPhoto(file);
          }}
        />
        <label
          htmlFor="profile-photo-input"
          className={`profile-photo-card__button${!isLoaded || uploadState.status === "uploading" ? " profile-photo-card__button--disabled" : ""}`}
          aria-disabled={!isLoaded || uploadState.status === "uploading"}
        >
          {uploadState.status === "uploading" ? "Uploading…" : user?.hasImage ? "Change photo" : "Upload photo"}
        </label>
      </div>
    </section>
  );
}
