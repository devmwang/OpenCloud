import React, { Suspense } from "react";

export default function FolderLayout(props: { children: React.ReactNode; modal: React.ReactNode }) {
    return (
        <>
            {props.children}
            {props.modal}
        </>
    );
}
