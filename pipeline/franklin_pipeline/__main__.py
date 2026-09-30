"""Pipeline entry point: python -m franklin_pipeline [fetch|build|all] (run from pipeline/)."""
import sys

from . import build_world, fetch_dem, fetch_overture, normalize, validate


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "build"
    stages = {
        "fetch": [fetch_overture.main, fetch_dem.main],
        "build": [normalize.main, validate.main, build_world.main],
    }
    stages["all"] = stages["fetch"] + stages["build"]
    if cmd not in stages:
        print(__doc__)
        return 2
    for stage in stages[cmd]:
        rc = stage([]) if stage is fetch_overture.main else stage()
        if rc:
            print(f"[pipeline] stage {stage.__module__} failed with {rc}", file=sys.stderr)
            return rc
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
