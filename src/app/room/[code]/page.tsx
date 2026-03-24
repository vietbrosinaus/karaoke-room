"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { RoomView } from "~/components/room/RoomView";

function RoomContent() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = params.code?.toUpperCase() ?? "";
  const initialName = searchParams.get("name") ?? "Anonymous";
  const [name, setName] = useState(initialName);

  if (!code) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p style={{ color: "var(--color-danger)" }}>Invalid room code.</p>
      </div>
    );
  }

  const handleRename = (newName: string) => {
    setName(newName);
    // Update URL without reload
    router.replace(`/room/${code}?name=${encodeURIComponent(newName)}`);
  };

  return <RoomView roomCode={code} playerName={name} onRename={handleRename} />;
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div
            className="text-lg"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-primary)",
              animation: "fade-in 0.5s ease-out",
            }}
          >
            Entering room...
          </div>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
