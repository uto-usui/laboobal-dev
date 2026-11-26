"""Shared atlas codes and limited projection distances, in meters."""
PART_CODES={2:'neck',3:'torso',4:'sleeve_L',5:'sleeve_R',6:'hand_L',7:'hand_R',8:'backpack',9:'shoulder_straps',10:'legs_shoes'}
PART_CODES={name:code for code,name in PART_CODES.items()}
PART_CODES.update(face=20,hair=21,cap=22)
DISTANCES={n:(.003,.005) for n in PART_CODES}
DISTANCES.update(neck=(.003,.004),hand_L=(.003,.004),hand_R=(.003,.004),cap=(.003,.004))
