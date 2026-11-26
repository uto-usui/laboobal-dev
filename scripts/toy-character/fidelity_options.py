"""Seed selection shared by generation, rendering and verification."""

def seed_number(value):
    import argparse
    try:
        seed = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError('seed must be a nonnegative integer')
    if seed < 0:
        raise argparse.ArgumentTypeError('seed must be a nonnegative integer')
    return seed


def add_seed_argument(parser):
    parser.add_argument('--seeds', type=seed_number, nargs='+', default=[42],
                        help='seeds to process (default: 42); completed outputs are retained')


def unique_seeds(seeds):
    return list(dict.fromkeys(seeds))
