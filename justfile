default:
    @just --list

# Install dependencies
install:
    pnpm install

# Build the unpacked extension into dist/
build:
    pnpm exec tsc -p .
    cp static/* dist/

# Rebuild on change (static files copied once at start)
watch: build
    pnpm exec tsc -p . --watch

# Type-check without emitting
check:
    pnpm exec tsc -p . --noEmit

# Move build output to the trash
clean:
    [ ! -e dist ] || trash dist
    [ ! -e riparc.zip ] || trash riparc.zip

# Package dist/ as riparc.zip
zip: clean build
    cd dist && zip -qr ../riparc.zip .

# Install the Karabiner rule that maps Ctrl+Tab to the riparc shortcut (enable it in Karabiner-Elements afterwards)
karabiner:
    mkdir -p ~/.config/karabiner/assets/complex_modifications
    cp karabiner/riparc.json ~/.config/karabiner/assets/complex_modifications/riparc.json
