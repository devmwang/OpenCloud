/** @type {import('tailwindcss').Config} */

module.exports = {
    darkMode: ["class"],
    content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                accent: "#0A78FF",
            },
            spacing: {
                "width-sidebar": "16rem",
                "height-statusbar": "4rem",
            },
            gridTemplateColumns: {
                "core-layout": "16rem 1fr",
                "fs-grid-view": "repeat(auto-fill, minmax(280px, 1fr))",
            },
            gridTemplateRows: {
                "core-layout": "4rem 1fr",
                "file-view-modal": "auto 1fr",
            },
            keyframes: {
                "accordion-down": {
                    from: { height: 0 },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: 0 },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
        },
        keyframes: {
            shimmer: {
                "100%": {
                    transform: "translateX(100%)",
                },
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
