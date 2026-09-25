from PIL import Image
from collections import Counter
image = Image.open('/home/ubuntu/safety-next/src/assets/tactivo-t-mark.png').convert('RGBA')
print('size', image.size)
print('corners', [image.getpixel(point) for point in [(0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1)]])
print('opaque colors', Counter(image.getdata()).most_common(10))
