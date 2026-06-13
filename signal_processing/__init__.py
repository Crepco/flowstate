"""FlowState signal-processing package.

Turns raw forehead-EEG samples into a relative focus score:

    raw samples -> notch(50Hz) + bandpass(1-40Hz) -> band powers
                -> engagement index (beta / (alpha + theta))
                -> focus score (0-100, relative to a personal baseline)
"""

from .filters import notch_filter, bandpass_filter, clean_signal
from .bands import BANDS, band_powers, engagement_index
from .classifier import LogisticFocusClassifier, feature_vector, FEATURE_NAMES
from .pipeline import FocusPipeline

__all__ = [
    "notch_filter",
    "bandpass_filter",
    "clean_signal",
    "BANDS",
    "band_powers",
    "engagement_index",
    "LogisticFocusClassifier",
    "feature_vector",
    "FEATURE_NAMES",
    "FocusPipeline",
]
