"""The accuracy measurement's join and answer categories (#670, ADR-047)."""

from __future__ import annotations

from shapely import STRtree
from shapely.geometry import box

from scripts.measure_circonscription_accuracy import (
    GROUP_PLM,
    GROUP_SPLIT,
    GROUP_WHOLE,
    NO_SEAT,
    SEVERAL_RIGHT,
    SURE_RIGHT,
    SURE_WRONG,
    UNJOINED_UNKNOWN_COMMUNE,
    Matcher,
    Sample,
    commune_group,
    load_reu_bureaux,
    ministry_bureau_code,
    reu_sample,
)


def test_ministry_code_is_kept_in_metropolitan_france():
    # Insee's register keys Paris by arrondissement; the Ministry code already names the city.
    assert ministry_bureau_code("75101", "75056_0101") == "75056_0101"


def test_overseas_letter_code_is_replaced_by_the_commune():
    assert ministry_bureau_code("97401", "ZD401_0010") == "97401_0010"


def test_commune_groups():
    seats = {"33063": {("33", 1), ("33", 2)}, "01001": {("01", 4)}}
    assert commune_group("75056", seats) == GROUP_PLM
    assert commune_group("33063", seats) == GROUP_SPLIT
    assert commune_group("01001", seats) == GROUP_WHOLE


def test_answers_follow_the_locator():
    # Two seats side by side along longitude 1.0, near the equator so degrees are ~111 km.
    geoms = [box(0.0, 0.0, 1.0, 1.0), box(1.0, 0.0, 2.0, 1.0)]
    sample = Sample()
    sample.add(0.5, 0.5, 0, GROUP_WHOLE)  # deep inside the right seat
    sample.add(1.5, 0.5, 0, GROUP_WHOLE)  # deep inside the wrong seat
    sample.add(0.9998, 0.5, 0, GROUP_WHOLE)  # ~22 m from the boundary
    sample.add(-0.1, 0.5, 0, GROUP_WHOLE)  # out at sea, ~11 km from any seat
    matcher = Matcher(sample, STRtree(geoms), geoms)

    assert list(matcher.categories(0)) == [SURE_RIGHT, SURE_WRONG, SURE_RIGHT, NO_SEAT]
    assert list(matcher.categories(50)) == [SURE_RIGHT, SURE_WRONG, SEVERAL_RIGHT, NO_SEAT]


def test_register_rows_below_the_score_are_left_out(tmp_path):
    rows = tmp_path / "adresses.csv"
    rows.write_text(
        "id_brut_bv_reu,geo_type,geo_score,longitude,latitude,nb_adresses,code_commune_ref\n"
        "01001_1,housenumber,0.95,0.5,0.5,2,01001\n"
        "01001_1,housenumber,0.55,0.5,0.5,1,01001\n"
        "01001_1,street,0.99,0.5,0.5,1,01001\n",
        encoding="utf-8",
    )
    sample, skipped, unjoined = reu_sample(
        rows,
        {"01001_1": "01001_0001"},
        {"01001_0001": ("01", 1)},
        {"01001": {("01", 1)}},
        {("01", 1): 0},
        min_score=0.9,
    )
    assert len(sample) == 1
    assert list(sample.weight) == [2]
    assert skipped == {
        "not a house number or lieu-dit": 1,
        "geocoded with a score below 0.9": 1,
    }
    assert not unjoined


def test_register_join_through_the_ministry_code(tmp_path):
    addresses = tmp_path / "adresses.csv"
    addresses.write_text(
        "id_brut_bv_reu,geo_type,geo_score,longitude,latitude,nb_adresses,code_commune_ref\n"
        "97401_10,housenumber,0.95,0.5,0.5,1,97401\n"  # overseas: letter code replaced
        "33063_9,housenumber,0.95,0.5,0.5,1,33063\n"  # station missing in a split commune
        "01999_1,housenumber,0.95,0.5,0.5,1,01999\n"  # commune not in the list at all
        "01001_1,housenumber,0.95,nan,0.5,1,01001\n",  # unusable point
        encoding="utf-8",
    )
    bureaux = tmp_path / "bv.csv"
    bureaux.write_text(
        "id_brut_reu,code_commune,id_brut_miom\n"
        "97401_10,97401,ZD401_0010\n33063_9,33063,33063_0009\n"
        "01999_1,01999,01999_0001\n01001_1,01001,01001_0001\n",
        encoding="utf-8",
    )
    sample, skipped, unjoined = reu_sample(
        addresses,
        load_reu_bureaux(bureaux),
        {"97401_0010": ("974", 2), "01001_0001": ("01", 1), "33063_0001": ("33", 1)},
        {"97401": {("974", 2)}, "01001": {("01", 1)}, "33063": {("33", 1), ("33", 2)}},
        {("974", 2): 0, ("01", 1): 1},
        min_score=0.9,
    )
    assert list(sample.expected) == [0]
    assert skipped == {"unreadable row": 1}
    assert unjoined == {GROUP_SPLIT: 1, UNJOINED_UNKNOWN_COMMUNE: 1}
