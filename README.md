> [!NOTE]
> **Fork notice:** this repository is a fork of [kuska1/Material-Theme](https://github.com/kuska1/Material-Theme). The theme manifest, releases, screenshots, authorship, and support links below refer to the upstream project. Use the upstream repository for official releases and support; this fork is a personal development snapshot maintained under the original MIT license.

<p align="center">
    <a href="https://github.com/kuska1/Material-Theme/">
        <picture>
          <img src="https://raw.githubusercontent.com/kuska1/Material-Theme/refs/heads/main/.github/logo.svg" alt="Material Logo" width="200">
        </picture>
    </a>
</p>

<div align="center">

# Material
### A Steam theme for [Millennium](https://steambrew.app), based on Google's Material 3 design.
[Discord](https://discord.gg/aGcKmX5KTs) | [Patreon](https://www.patreon.com/c/flowird) | [Ko-fi](https://ko-fi.com/flowird)

## Screenshots
![Library](https://raw.githubusercontent.com/kuska1/Material-Theme/refs/heads/main/.github/library.jpg)
![Dynamic](https://raw.githubusercontent.com/kuska1/Material-Theme/refs/heads/main/.github/dynamic.gif)

</div>

## Setup and customization

This is a theme for the Steam client, not a standalone application. Install [Millennium](https://steambrew.app) and use the [upstream project](https://github.com/kuska1/Material-Theme) for official releases and installation guidance. This fork does not provide its own release or compatibility guarantees.

The checked-in [`skin.json`](skin.json) identifies the theme as **Material**, version **1.5.17**. Its conditions define the available appearance, color, typography, layout, and visual privacy options. Configure those options through Millennium's theme settings. Keep the manifest, CSS, JavaScript, and font assets together when working with a local copy.

Dynamic color is marked beta, and several restyles remain works in progress. The privacy options change what the interface displays; they do not change Steam account privacy settings.

## Features:
### UI
* Library, overlay, notifications, big picture mode restyles [WIP]
* Download manager restyle
### Style
* Appearance (Light/Dark/OLED)
* Source color (Basic/Custom/Dynamic [Beta])
* Matugen support
* Material icons
* Fonts (Default/Roboto/Open Sans/Google Sans/Fira Sans)
* Alternative online indicator
### Toolbar
* Title collapse
* Icon change
* Title change
* Account button style
* Toolbar buttons hider
* Bottom bar style (Default/Floating)
### Shapes
* Profile picture shape
* Groups picture shape
* Game icons shape
* Achievements icons shape
### Store
* Always visible header
### Library
* What's New style
* Hover animations
### Privacy
* Account Name Hider
* Account Balance Hider
### Extra
* More animations
* Loading style
* Hide scrollbar

## TODO:
### UI
* Store, Community restyles, etc...

## Credits:
### Developer
* [kuska1](https://github.com/kuska1)
* [Contributors](https://github.com/kuska1/Material-Theme/graphs/contributors)
### Inspiration & Borrowed the Code
* [NEVKO-UI](https://github.com/dotFelixan/NEVKO-UI)
* [SpaceTheme](https://github.com/SpaceTheme/Steam)

## Contact & Support
* [Discord Server](https://discord.gg/aGcKmX5KTs)
* [Patreon](https://www.patreon.com/c/flowird)
* [Ko-fi](https://ko-fi.com/flowird)

## Development

The theme is plain CSS and JavaScript loaded through Millennium. There is no package manifest, build command, or automated test suite in this snapshot.

| Path | Purpose |
| --- | --- |
| [`skin.json`](skin.json) | Theme metadata, selectable conditions, and patch mappings |
| [`css/main/`](css/main/) | Core styles, appearance modes, and Steam page restyles |
| [`css/options/`](css/options/) | Styles enabled by theme options |
| [`js/`](js/) | Color generation and optional interface effects |
| Root `*.custom.css` files and [`webkit.css`](webkit.css) | CSS entry points for Steam interfaces |

When changing a condition, check its referenced asset paths against the repository. Test changes in Steam with Millennium, including the affected pages and appearance modes. Steam UI updates can change selectors; include your Steam and Millennium versions when reporting visual problems. Use the upstream support links above for official support and contributions.

## License

[MIT](LICENSE). Copyright (c) 2025–2026 Bogdan Kus'. Preserve the license and upstream attribution when redistributing the theme.
