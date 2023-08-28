"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

import { env } from "@/env/env.mjs";

export function ImageView({ fileId }: { fileId: string }) {
    const zoomSpeed = 0.1;

    const [scale, setScale] = useState(1);

    function onMouseWheel(event: WheelEvent) {
        if (event.deltaY > 0) {
            setScale(Math.max(scale - zoomSpeed, 0.5));
        } else {
            setScale(Math.min(scale + zoomSpeed, 2));
        }
    }

    useEffect(() => {
        document.addEventListener("wheel", onMouseWheel);

        return () => document.removeEventListener("wheel", onMouseWheel);
    }, [onMouseWheel]);

    return (
        <>
            <Image
                className="object-scale-down"
                style={{ transform: `scale(${scale})` }}
                src={`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get/${fileId}`}
                fill={true}
                alt="File View"
                placeholder="data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjcwMCIgaGVpZ2h0PSI0NzUiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjcwMCIgaGVpZ2h0PSI0NzUiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSI3MDAiIGhlaWdodD0iNDc1IiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItNzAwIiB0bz0iNzAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg=="
                unoptimized={true}
            />
        </>
    );
}
