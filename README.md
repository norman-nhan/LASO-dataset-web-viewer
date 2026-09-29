# LASO Dataset Reviewer

A lightweight local web interface for reviewing every object, point cloud,
affordance mask, and language annotation in `data/LASO_dataset`.

## Run

Run it through the workspace's persistent Docker container from the workspace
root. The launcher uses the existing `/ros2_ws/.venv/laso_env` environment:

```bash
./scripts/laso-review.sh
```

Then visit <http://127.0.0.1:8080>. Use `Ctrl+C` to stop it. The default
container configuration publishes container port 8080 on the host. Override the
host port when the container is first created with `LASO_REVIEW_PORT=8090
./docker/run.sh`.

If the persistent container was created before the reviewer port was added, it
must be recreated once for Docker to add the port mapping. Check with
`docker port openarm-grasping 8080`. A different dataset location can be passed
directly to `server.py` with `--dataset /path/to/LASO_dataset`.

> Pickle files can execute code while loading. Only point this reviewer at a
> dataset you trust.

## Controls

- Drag to rotate the point cloud.
- Scroll to zoom; double-click to reset the view.
- Pick an affordance to color its mask orange.
- Search or filter the object list; use the arrow buttons or keyboard arrow
  keys to move between visible objects.
- Toggle **Only labeled points** to isolate the selected affordance.
