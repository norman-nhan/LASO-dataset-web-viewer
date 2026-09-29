# LASO Dataset Reviewer

A lightweight local web interface for reviewing every object, point cloud,
affordance mask, and language annotation in `data/LASO_dataset`.

## Setup
1. Download the [LASO dataset](https://github.com/yl3800/laso).
2. Install dependencies.
```bash
# Create uv venv
uv venv ~/.venv/laso_env --python 3.9
. ~/.venv/laso_env/bin/activate
# Install dependencies
(laso_env) uv pip install numpy open3d gdown
```

> [!IMPORTANT]
> Pickle files can execute code while loading. Only point this reviewer at a
> dataset you trust.

## Open the viewer
```bash
. .venv/laso_env/bin/activate
python server.py
```
- Add `--dataset \path\to\dataset` to specify path to dataset
## Controls

- Drag to rotate the point cloud.
- Scroll to zoom; double-click to reset the view.
- Pick an affordance to color its mask orange.
- Search or filter the object list; use the arrow buttons or keyboard arrow
  keys to move between visible objects.
- Toggle **Only labeled points** to isolate the selected affordance.
