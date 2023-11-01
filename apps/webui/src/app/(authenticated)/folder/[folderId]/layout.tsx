import React from "react";

export default function FolderSubLayout(props: { children: React.ReactNode; modal: React.ReactNode }) {
    return (
        <>
            {props.children}
            {props.modal}
        </>
    );
}
