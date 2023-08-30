import React, { Suspense } from "react";

import Loading from "./loading-page";

export default function FolderLayout(props: { children: React.ReactNode; modal: React.ReactNode }) {
    return (
        <>
            <Suspense fallback={<Loading />}>{props.children}</Suspense>

            {props.modal}
        </>
    );
}
