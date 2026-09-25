from PIL import Image
from pathlib import Path

source = Path('/home/ubuntu/upload/TACTIVOLOGO.jpeg')
target = Path('/home/ubuntu/safety-next/src/assets/tactivo-t-mark.png')
image = Image.open(source).convert('RGBA')
# The supplied square contains the emblem in the upper-middle section; exclude all wordmark/tagline content.
crop = image.crop((430, 185, 830, 650))
pixels = crop.load()
for y in range(crop.height):
    for x in range(crop.width):
        r, g, b, _ = pixels[x, y]
        # Make the white JPEG background transparent while retaining the dark and magenta emblem.
        if r > 242 and g > 242 and b > 242:
            pixels[x, y] = (255, 255, 255, 0)
        else:
            pixels[x, y] = (r, g, b, 255)
alpha = crop.getchannel('A')
bbox = alpha.getbbox()
if bbox:
    left, top, right, bottom = bbox
    margin = 18
    bbox = (max(0, left - margin), max(0, top - margin), min(crop.width, right + margin), min(crop.height, bottom + margin))
    crop = crop.crop(bbox)
target.parent.mkdir(parents=True, exist_ok=True)
crop.save(target, 'PNG', optimize=True)
print(target)
print(crop.size)
