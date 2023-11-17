"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ZoomIn, ZoomOut } from "lucide-react";

import { env } from "@/env/env.mjs";

export function ImagePreviewPane({ fileId }: { fileId: string }) {
    const zoomSpeed = 0.1;

    const [scale, setScale] = useState(1);

    function incrementScale() {
        setScale(Math.min(scale + zoomSpeed, 2));
    }

    function decrementScale() {
        setScale(Math.max(scale - zoomSpeed, 0.5));
    }

    function onMouseWheel(event: WheelEvent) {
        if (event.deltaY > 0) {
            decrementScale();
        } else {
            incrementScale();
        }
    }

    useEffect(() => {
        document.addEventListener("wheel", onMouseWheel);

        return () => document.removeEventListener("wheel", onMouseWheel);
    }, [onMouseWheel]);

    return (
        <>
            <Image
                className="select-none object-scale-down transition-transform duration-200 ease-in-out"
                style={{ transform: `scale(${scale})` }}
                src={`${env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL}/v1/files/get/${fileId}`}
                fill={true}
                alt="File View"
                unoptimized={true}
            />
            <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 select-none flex-row items-center rounded-full bg-zinc-800/60">
                <ZoomOut
                    className="m-4 h-6 cursor-pointer"
                    onClick={() => {
                        decrementScale();
                    }}
                />
                <span className="text-lg font-medium">{Math.round(scale * 100)}%</span>
                <ZoomIn
                    className="m-4 h-6 cursor-pointer"
                    onClick={() => {
                        incrementScale();
                    }}
                />
            </div>
        </>
    );
}
