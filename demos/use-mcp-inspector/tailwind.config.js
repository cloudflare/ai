/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            pre: {
              padding: "0",
              filter: "brightness(96%)",
              border: "0",
              backgroundColor: "transparent",
            },
          },
        },
      },
    },
  },
};
